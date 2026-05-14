import fs from 'fs';
import path from 'path';
import { getProjectAnswers } from '../config/project-answers';
import { env } from '../config/env';

const answers = getProjectAnswers();
const appName = answers.project?.app_name || 'reportops';
const environment = answers.project?.environment || 'dev';
const defaultMachineType = answers.vm_defaults?.machine_type || 'e2-micro';
const frontendUrl = answers.project?.frontend_url || 'https://automatedprogram.app';
const labVmSshKeys = process.env.LAB_VM_SSH_KEYS || '';

const out = {
  project_id: answers.project?.gcp_project_id || 'cis-benchmark-uit',
  region: answers.project?.region || 'asia-southeast1',
  zone: answers.project?.zone || 'asia-southeast1-c',
  vm_name: `${appName}-${environment}`,
  machine_type: defaultMachineType,
  enable_oslogin: false,
  vm_id: '0',
  owner_name: 'Admin',
  section_label: 'M1',
  benchmark_name: answers.benchmark?.name || 'CIS AlmaLinux OS 9 Benchmark',
  benchmark_version: answers.benchmark?.version || '2.0.0',
  benchmark_profile: answers.benchmark?.profile || 'Level 1 - Server',
  frontend_url: frontendUrl,
  verification_token: 'placeholder',
  ssh_keys: labVmSshKeys,
  audit_runner_ssh_public_key: env.AUDIT_RUNNER_SSH_PUBLIC_KEY,
};

const target = path.resolve(__dirname, '../../../infra/terraform/environments/dev/auto.tfvars.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`Wrote ${target}`);
