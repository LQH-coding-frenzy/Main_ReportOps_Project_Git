import { parentPort, workerData } from 'worker_threads';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

interface SectionData {
  code: string;
  buffer: Buffer;
}

interface WorkerInput {
  sections: SectionData[];
  fallbackBuffer: Buffer;
}

type LoadedDocx = JSZip;
type XmlNode = any;
type XmlElement = any;

type MediaEntry = {
  oldTarget: string;
  newTarget: string;
  fileIndex: number;
  oldRelID?: string;
};

const PAGE_BREAK_XML = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const RSID_ATTR_RE = /\s+w:rsid(?:R|P|RPr|Del|RDefault|Tr|S)="[^"]*"/g;

function replaceXmlFromRoot(xmlString: string, rootTagPrefix: string, replacement: string): string {
  const startIndex = xmlString.indexOf(rootTagPrefix);
  if (startIndex === -1) {
    return replacement;
  }

  return xmlString.slice(0, startIndex) + replacement;
}

function getXmlDocument(xmlString: string) {
  return new DOMParser().parseFromString(xmlString, 'text/xml');
}

async function readZipText(zip: LoadedDocx, filePath: string): Promise<string> {
  const entry = zip.file(filePath);
  if (!entry) {
    throw new Error(`Missing DOCX part: ${filePath}`);
  }

  return entry.async('string');
}

async function readZipBytes(zip: LoadedDocx, filePath: string): Promise<Uint8Array> {
  const entry = zip.file(filePath);
  if (!entry) {
    throw new Error(`Missing DOCX part: ${filePath}`);
  }

  return entry.async('uint8array');
}

function listMediaFiles(zip: LoadedDocx): string[] {
  return Object.keys(zip.files).filter((filePath) => filePath.startsWith('word/media/') && !zip.files[filePath].dir);
}

function collectElementNodes(nodes: { length: number; [index: number]: XmlNode } | null | undefined): XmlNode[] {
  if (!nodes) {
    return [];
  }

  return Array.from({ length: nodes.length }, (_, index) => nodes[index]).filter(Boolean);
}

async function prepareDocxForMerge(buffer: Buffer): Promise<LoadedDocx> {
  const zip = await JSZip.loadAsync(buffer);

  try {
    const docXmlPath = 'word/document.xml';
    const docXmlFile = zip.file(docXmlPath);

    if (docXmlFile) {
      let xml = await docXmlFile.async('string');
      // Remove revision identifiers that are known to trigger Word repair prompts after merges.
      xml = xml.replace(RSID_ATTR_RE, '');
      zip.file(docXmlPath, xml);
    }

    const settingsPath = 'word/settings.xml';
    const settingsFile = zip.file(settingsPath);
    if (settingsFile) {
      let settingsXml = await settingsFile.async('string');
      settingsXml = settingsXml.replace(/<w:proofState [^>]*\/>/g, '');
      zip.file(settingsPath, settingsXml);
    }
  } catch (err) {
    console.error('Failed to sanitize section, proceeding with original ZIP structure:', err);
  }

  return zip;
}

async function mergeContentTypes(files: LoadedDocx[], contentTypes: Record<string, XmlNode>): Promise<void> {
  for (const zip of files) {
    const xmlString = await readZipText(zip, '[Content_Types].xml');
    const xml = getXmlDocument(xmlString);
    const childNodes = collectElementNodes(xml.getElementsByTagName('Types')[0]?.childNodes);

    for (const node of childNodes) {
      if (typeof node.getAttribute === 'function') {
        const contentType = node.getAttribute('ContentType');
        if (contentType && !contentTypes[contentType]) {
          contentTypes[contentType] = node.cloneNode(true);
        }
      }
    }
  }
}

async function mergeRelations(files: LoadedDocx[], relations: Record<string, XmlNode>): Promise<void> {
  for (const zip of files) {
    const xmlString = await readZipText(zip, 'word/_rels/document.xml.rels');
    const xml = getXmlDocument(xmlString);
    const childNodes = collectElementNodes(xml.getElementsByTagName('Relationships')[0]?.childNodes);

    for (const node of childNodes) {
      if (typeof node.getAttribute === 'function') {
        const id = node.getAttribute('Id');
        if (id && !relations[id]) {
          relations[id] = node.cloneNode(true);
        }
      }
    }
  }
}

async function generateContentTypes(zip: LoadedDocx, contentTypes: Record<string, XmlNode>): Promise<void> {
  const xmlString = await readZipText(zip, '[Content_Types].xml');
  const xml = getXmlDocument(xmlString);
  const serializer = new XMLSerializer();
  const types = xml.documentElement?.cloneNode(true) as XmlElement;

  if (!types) {
    throw new Error('Invalid [Content_Types].xml root');
  }

  for (const node of Object.values(contentTypes)) {
    types.appendChild(node.cloneNode(true));
  }

  zip.file('[Content_Types].xml', replaceXmlFromRoot(xmlString, '<Types', serializer.serializeToString(types)));
}

async function generateRelations(zip: LoadedDocx, relations: Record<string, XmlNode>): Promise<void> {
  const xmlString = await readZipText(zip, 'word/_rels/document.xml.rels');
  const xml = getXmlDocument(xmlString);
  const serializer = new XMLSerializer();
  const root = xml.documentElement?.cloneNode(true) as XmlElement;

  if (!root) {
    throw new Error('Invalid document.xml.rels root');
  }

  for (const node of Object.values(relations)) {
    root.appendChild(node.cloneNode(true));
  }

  zip.file('word/_rels/document.xml.rels', replaceXmlFromRoot(xmlString, '<Relationships', serializer.serializeToString(root)));
}

async function updateMediaRelations(zip: LoadedDocx, mediaEntry: MediaEntry): Promise<void> {
  const xmlString = await readZipText(zip, 'word/_rels/document.xml.rels');
  const xml = getXmlDocument(xmlString);
  const serializer = new XMLSerializer();
  const childNodes = collectElementNodes(xml.getElementsByTagName('Relationships')[0]?.childNodes);
  const root = xml.documentElement;

  if (!root) {
    throw new Error('Invalid document.xml.rels XML');
  }

  for (const node of childNodes) {
    const element = node as XmlElement;
    const target = element.getAttribute('Target');
    if (`word/${String(target || '')}` === mediaEntry.oldTarget) {
      mediaEntry.oldRelID = element.getAttribute('Id') || undefined;
      element.setAttribute('Target', mediaEntry.newTarget);
      element.setAttribute('Id', `${mediaEntry.oldRelID}_${mediaEntry.fileIndex + 1}`);
    }
  }

  zip.file('word/_rels/document.xml.rels', replaceXmlFromRoot(xmlString, '<Relationships', serializer.serializeToString(root)));
}

async function updateMediaContent(zip: LoadedDocx, mediaEntry: MediaEntry): Promise<void> {
  if (!mediaEntry.oldRelID) {
    return;
  }

  const xmlString = await readZipText(zip, 'word/document.xml');
  const nextXml = xmlString.replace(
    new RegExp(`${mediaEntry.oldRelID}"`, 'g'),
    `${mediaEntry.oldRelID}_${mediaEntry.fileIndex + 1}"`
  );

  zip.file('word/document.xml', nextXml);
}

async function prepareMediaFiles(files: LoadedDocx[], mediaMap: Record<number, MediaEntry>): Promise<void> {
  let count = 1;

  for (let index = 0; index < files.length; index += 1) {
    const zip = files[index];
    const mediaFiles = listMediaFiles(zip);

    for (const mediaFile of mediaFiles) {
      const mediaEntry: MediaEntry = {
        oldTarget: mediaFile,
        newTarget: mediaFile.replace(/[0-9]/, `_${count}`).replace('word/', ''),
        fileIndex: index,
      };

      mediaMap[count] = mediaEntry;
      await updateMediaRelations(zip, mediaEntry);
      await updateMediaContent(zip, mediaEntry);
      count += 1;
    }
  }
}

async function copyMediaFiles(base: LoadedDocx, mediaMap: Record<number, MediaEntry>, files: LoadedDocx[]): Promise<void> {
  for (const mediaEntry of Object.values(mediaMap)) {
    const content = await readZipBytes(files[mediaEntry.fileIndex], mediaEntry.oldTarget);
    base.file(`word/${mediaEntry.newTarget}`, content);
  }
}

async function updateStyleRelationContent(zip: LoadedDocx, fileIndex: number, styleId: string): Promise<void> {
  const xmlString = await readZipText(zip, 'word/document.xml');
  const nextXml = xmlString.replace(new RegExp(`w:val="${styleId}"`, 'g'), `w:val="${styleId}_${fileIndex}"`);
  zip.file('word/document.xml', nextXml);
}

async function prepareStyles(files: LoadedDocx[], styleBuffer: string[]): Promise<void> {
  const serializer = new XMLSerializer();

  for (let index = 0; index < files.length; index += 1) {
    const zip = files[index];
    let xmlString = await readZipText(zip, 'word/styles.xml');
    const xml = getXmlDocument(xmlString);
    const root = xml.documentElement;
    if (!root) {
      throw new Error('Invalid styles.xml root');
    }
    const nodes = collectElementNodes(xml.getElementsByTagName('w:style') as any);

    for (const node of nodes) {
      const styleId = node.getAttribute('w:styleId');
      if (!styleId) {
        continue;
      }

      node.setAttribute('w:styleId', `${styleId}_${index}`);

      const basedOn = node.getElementsByTagName('w:basedOn')[0];
      if (basedOn) {
        const basedOnStyleId = basedOn.getAttribute('w:val');
        if (basedOnStyleId) {
          basedOn.setAttribute('w:val', `${basedOnStyleId}_${index}`);
        }
      }

      const nextNode = node.getElementsByTagName('w:next')[0];
      if (nextNode) {
        const nextId = nextNode.getAttribute('w:val');
        if (nextId) {
          nextNode.setAttribute('w:val', `${nextId}_${index}`);
        }
      }

      const linkNode = node.getElementsByTagName('w:link')[0];
      if (linkNode) {
        const linkId = linkNode.getAttribute('w:val');
        if (linkId) {
          linkNode.setAttribute('w:val', `${linkId}_${index}`);
        }
      }

      const numIdNode = node.getElementsByTagName('w:numId')[0];
      if (numIdNode) {
        const numId = numIdNode.getAttribute('w:val');
        if (numId) {
          numIdNode.setAttribute('w:val', `${numId}${index}`);
        }
      }

      await updateStyleRelationContent(zip, index, styleId);
    }

    xmlString = replaceXmlFromRoot(xmlString, '<w:styles', serializer.serializeToString(root));
    zip.file('word/styles.xml', xmlString);
  }

  for (const zip of files) {
    let xml = await readZipText(zip, 'word/styles.xml');
    xml = xml.substring(xml.indexOf('<w:style '), xml.indexOf('</w:styles'));
    styleBuffer.push(xml);
  }
}

async function generateStyles(zip: LoadedDocx, styleBuffer: string[]): Promise<void> {
  let xml = await readZipText(zip, 'word/styles.xml');
  const startIndex = xml.indexOf('<w:style ');
  const endIndex = xml.indexOf('</w:styles>');
  xml = xml.replace(xml.slice(startIndex, endIndex), styleBuffer.join(''));
  zip.file('word/styles.xml', xml);
}

async function prepareNumbering(files: LoadedDocx[]): Promise<void> {
  const serializer = new XMLSerializer();

  for (let index = 0; index < files.length; index += 1) {
    const zip = files[index];
    const numberingFile = zip.file('word/numbering.xml');
    if (!numberingFile) {
      continue;
    }

    let xmlString = await numberingFile.async('string');
    const xml = getXmlDocument(xmlString);
    const root = xml.documentElement;
    if (!root) {
      throw new Error('Invalid numbering.xml root');
    }

    for (const node of collectElementNodes(xml.getElementsByTagName('w:abstractNum') as any)) {
      const absId = node.getAttribute('w:abstractNumId');
      if (absId) {
        node.setAttribute('w:abstractNumId', `${absId}${index}`);
      }

      for (const pStyle of collectElementNodes(node.getElementsByTagName('w:pStyle') as any)) {
        const pStyleId = pStyle.getAttribute('w:val');
        if (pStyleId) {
          pStyle.setAttribute('w:val', `${pStyleId}_${index}`);
        }
      }

      for (const numStyleLink of collectElementNodes(node.getElementsByTagName('w:numStyleLink') as any)) {
        const styleLinkId = numStyleLink.getAttribute('w:val');
        if (styleLinkId) {
          numStyleLink.setAttribute('w:val', `${styleLinkId}_${index}`);
        }
      }

      for (const styleLink of collectElementNodes(node.getElementsByTagName('w:styleLink') as any)) {
        const styleLinkId = styleLink.getAttribute('w:val');
        if (styleLinkId) {
          styleLink.setAttribute('w:val', `${styleLinkId}_${index}`);
        }
      }
    }

    for (const node of collectElementNodes(xml.getElementsByTagName('w:num') as any)) {
      const numId = node.getAttribute('w:numId');
      if (numId) {
        node.setAttribute('w:numId', `${numId}${index}`);
      }

      for (const abstractNumRef of collectElementNodes(node.getElementsByTagName('w:abstractNumId') as any)) {
        const refId = abstractNumRef.getAttribute('w:val');
        if (refId) {
          abstractNumRef.setAttribute('w:val', `${refId}${index}`);
        }
      }
    }

    xmlString = replaceXmlFromRoot(xmlString, '<w:numbering', serializer.serializeToString(root));
    zip.file('word/numbering.xml', xmlString);
  }
}

async function mergeNumbering(files: LoadedDocx[], numberingBuffer: string[]): Promise<void> {
  for (const zip of files) {
    const numberingFile = zip.file('word/numbering.xml');
    if (!numberingFile) {
      continue;
    }

    let xml = await numberingFile.async('string');
    xml = xml.substring(xml.indexOf('<w:abstractNum '), xml.indexOf('</w:numbering'));
    numberingBuffer.push(xml);
  }
}

async function generateNumbering(zip: LoadedDocx, numberingBuffer: string[]): Promise<void> {
  const numberingFile = zip.file('word/numbering.xml');
  if (!numberingFile) {
    return;
  }

  let xml = await numberingFile.async('string');
  const startIndex = xml.indexOf('<w:abstractNum ');
  const endIndex = xml.indexOf('</w:numbering>');
  xml = xml.replace(xml.slice(startIndex, endIndex), numberingBuffer.join(''));
  zip.file('word/numbering.xml', xml);
}

function normalizeMergedWordDocumentXml(xmlString: string): string {
  const serializer = new XMLSerializer();
  const xml = getXmlDocument(xmlString.replace(RSID_ATTR_RE, ''));
  const root = xml.documentElement;

  if (!root) {
    throw new Error('Invalid merged document.xml root');
  }

  let nextDocPrId = 1;
  for (const node of collectElementNodes(xml.getElementsByTagName('wp:docPr') as any)) {
    node.setAttribute('id', String(nextDocPrId));
    nextDocPrId += 1;
  }

  let nextCNvPrId = 1;
  for (const node of collectElementNodes(xml.getElementsByTagName('pic:cNvPr') as any)) {
    node.setAttribute('id', String(nextCNvPrId));
    nextCNvPrId += 1;
  }

  const serialized = serializer.serializeToString(root);
  return replaceXmlFromRoot(xmlString, '<w:document', serialized).replace(RSID_ATTR_RE, '');
}

async function mergeDocxFiles(files: LoadedDocx[]): Promise<Buffer> {
  const body: string[] = [];
  const styleBuffer: string[] = [];
  const numberingBuffer: string[] = [];
  const contentTypes: Record<string, XmlNode> = {};
  const mediaMap: Record<number, MediaEntry> = {};
  const relations: Record<string, XmlNode> = {};

  await mergeContentTypes(files, contentTypes);
  await prepareMediaFiles(files, mediaMap);
  await mergeRelations(files, relations);
  await prepareNumbering(files);
  await mergeNumbering(files, numberingBuffer);
  await prepareStyles(files, styleBuffer);

  for (let index = 0; index < files.length; index += 1) {
    const zip = files[index];
    let xml = await readZipText(zip, 'word/document.xml');
    xml = xml.substring(xml.indexOf('<w:body>') + 8);
    xml = xml.substring(0, xml.indexOf('</w:body>'));
    xml = xml.substring(0, xml.lastIndexOf('<w:sectPr'));
    body.push(xml);

    if (index < files.length - 1) {
      body.push(PAGE_BREAK_XML);
    }
  }

  const baseZip = files[0];
  let documentXml = await readZipText(baseZip, 'word/document.xml');
  const startIndex = documentXml.indexOf('<w:body>') + 8;
  const endIndex = documentXml.lastIndexOf('<w:sectPr');
  documentXml = documentXml.replace(documentXml.slice(startIndex, endIndex), body.join(''));
  documentXml = normalizeMergedWordDocumentXml(documentXml);

  await generateContentTypes(baseZip, contentTypes);
  await copyMediaFiles(baseZip, mediaMap, files);
  await generateRelations(baseZip, relations);
  await generateNumbering(baseZip, numberingBuffer);
  await generateStyles(baseZip, styleBuffer);

  baseZip.file('word/document.xml', documentXml);
  return baseZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function performMerge() {
  const { sections, fallbackBuffer } = workerData as WorkerInput;
  const recovered: string[] = [];

  try {
    const preparedSections: LoadedDocx[] = [];

    console.log(`[Worker] Pre-processing ${sections.length} sections...`);

    for (const section of sections) {
      const { code, buffer } = section;

      try {
        const prepared = await prepareDocxForMerge(buffer);
        preparedSections.push(prepared);
      } catch (error) {
        console.warn(`[Worker] Section ${code} is corrupt. Using fallback.`, error);
        preparedSections.push(await prepareDocxForMerge(fallbackBuffer));
        recovered.push(code);
      }
    }

    if (preparedSections.length === 0) {
      throw new Error('No valid documents to merge.');
    }

    console.log(`[Worker] Merging ${preparedSections.length} sections...`);
    const result = await mergeDocxFiles(preparedSections);

    parentPort?.postMessage({
      status: 'success',
      data: result,
      recovered,
    });
  } catch (error) {
    console.error('[Worker Fatal Error]', error);
    parentPort?.postMessage({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

void performMerge();
