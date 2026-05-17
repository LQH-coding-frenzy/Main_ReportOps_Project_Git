import { NodeSSH } from 'node-ssh';
import fs from 'fs';
import path from 'path';

export interface SSHRunnerConfig {
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  privateKey?: string | Buffer;
}

export interface SSHCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const DEFAULT_REMOTE_CWD = '/home/audituser';

export class SSHRunner {
  private ssh: NodeSSH;
  private config: SSHRunnerConfig;
  private isConnected = false;

  constructor(config: SSHRunnerConfig) {
    this.ssh = new NodeSSH();
    this.config = {
      ...config,
      port: config.port || 22,
      username: config.username || 'audituser',
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    await this.ssh.connect({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      privateKey: (this.config.privateKeyPath || this.config.privateKey) as never,
      readyTimeout: 60000, // Increase to 60 seconds
    });
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      this.ssh.dispose();
      this.isConnected = false;
    }
  }

  async execCommand(command: string, options: { cwd?: string } = {}): Promise<SSHCommandResult> {
    await this.connect();
    const result = await this.ssh.execCommand(command, {
      cwd: options.cwd || DEFAULT_REMOTE_CWD,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code || 0,
    };
  }

  async uploadFile(localContent: string | Buffer, remotePath: string): Promise<void> {
    await this.connect();
    
    // We create a temporary local file because node-ssh putFile requires a file path
    // Alternatively, we can use ssh.putFiles with a readable stream? Actually node-ssh putFile doesn't support Buffer directly
    // Let's write to a local temp file
    const tempName = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.sh`;
    const tempPath = path.join(process.cwd(), tempName);
    
    try {
      fs.writeFileSync(tempPath, localContent);
      await this.ssh.putFile(tempPath, remotePath);
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
}
