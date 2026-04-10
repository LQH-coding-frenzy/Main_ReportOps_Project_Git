import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions: {
      edit: boolean;
      download: boolean;
      print: boolean;
      review: boolean;
      comment: boolean;
    };
  };
  documentType: string;
  editorConfig: {
    callbackUrl: string;
    mode: string;
    lang: string;
    user: {
      id: string;
      name: string;
    };
    customization: {
      autosave: boolean;
      forcesave: boolean;
      chat: boolean;
      comments: boolean;
      compactHeader: boolean;
      feedback: boolean;
      help: boolean;
    };
  };
  token?: string;
}

interface EditorConfigParams {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  userId: number;
  userName: string;
  sectionId: number;
  canEdit: boolean;
  updatedAt: string;
}

/**
 * Generate ONLYOFFICE editor configuration for embedding.
 *
 * @see https://api.onlyoffice.com/editors/config
 */
export function generateEditorConfig(params: EditorConfigParams): OnlyOfficeConfig {
  const { fileUrl, fileKey, fileName, userId, userName, sectionId, canEdit, updatedAt } = params;

  // Unique document key — MUST change only when document content changes.
  // Using random UUIDs breaks co-editing and causes permission errors if fetched twice.
  const documentKey = `${fileKey.replace(/[^a-zA-Z0-9.-]/g, '_')}-${updatedAt}`;

  const config: OnlyOfficeConfig = {
    document: {
      fileType: 'docx',
      key: documentKey,
      title: fileName,
      url: fileUrl,
      permissions: {
        edit: canEdit,
        download: true,
        print: true,
        review: false, // Disabled for simplicity — each person owns their section
        comment: true,
      },
    },
    documentType: 'word',
    editorConfig: {
      callbackUrl: `${env.BACKEND_PUBLIC_URL}/api/onlyoffice/callback?sectionId=${sectionId}`,
      mode: canEdit ? 'edit' : 'view',
      lang: 'vi', // Vietnamese
      user: {
        id: String(userId),
        name: userName,
      },
      customization: {
        autosave: true,
        forcesave: true,
        chat: false,
        comments: true,
        compactHeader: false,
        feedback: false,
        help: false,
      },
    },
  };

  // Sign the config with JWT if ONLYOFFICE JWT is enabled
  if (env.ONLYOFFICE_JWT_SECRET) {
    config.token = jwt.sign(config, env.ONLYOFFICE_JWT_SECRET);
  }

  return config;
}

/**
 * Verify the JWT token from ONLYOFFICE callback.
 */
export function verifyCallbackToken(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, env.ONLYOFFICE_JWT_SECRET) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * ONLYOFFICE callback status codes.
 * @see https://api.onlyoffice.com/editors/callback
 */
export const CallbackStatus = {
  EDITING: 1, // Document is being edited
  READY_FOR_SAVE: 2, // Document is ready for saving (all editors closed)
  SAVE_ERROR: 3, // Document saving error
  NO_CHANGES: 4, // Document closed without changes
  FORCE_SAVE: 6, // Document force-saved while still being edited
  FORCE_SAVE_ERROR: 7, // Force save error
} as const;
