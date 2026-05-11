import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export type ProjectAnswers = {
  project?: {
    gcp_project_id?: string;
    region?: string;
    zone?: string;
    app_name?: string;
    environment?: string;
    frontend_url?: string;
    backend_url?: string;
    onlyoffice_url?: string;
  };
  vm_defaults?: {
    machine_type?: string;
  };
  benchmark?: {
    name?: string;
    version?: string;
    profile?: string;
  };
  storage?: {
    documents_bucket?: string;
    archive_bucket?: string;
  };
  m1_scope?: {
    sections?: string[];
  };
  audit_pack?: {
    pack_id?: string;
    title?: string;
    owner_section?: string;
    benchmark_name?: string;
    benchmark_version?: string;
    profile?: string;
    sections?: string[];
  };
};

const DEFAULT_PATHS = [
  path.resolve(process.cwd(), '../project.answers.yaml'),
  path.resolve(process.cwd(), 'project.answers.yaml'),
];

export function loadProjectAnswers(customPath?: string): ProjectAnswers {
  const filePath = customPath || DEFAULT_PATHS.find((p) => fs.existsSync(p));

  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  return YAML.parse(raw) as ProjectAnswers;
}

export function getProjectAnswers(): ProjectAnswers {
  return loadProjectAnswers(process.env.PROJECT_ANSWERS_PATH);
}
