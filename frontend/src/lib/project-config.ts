const isProduction = process.env.NODE_ENV === 'production';

const defaultFrontendUrl = isProduction ? 'https://automatedprogram.app' : 'http://localhost:3000';
const defaultBackendUrl = isProduction ? 'https://api.automatedprogram.app' : 'http://localhost:4000';
const defaultOnlyOfficeUrl = isProduction ? 'https://docs.automatedprogram.app' : 'http://localhost:8080';
const defaultBenchmarkName = 'CIS AlmaLinux OS 9 Benchmark';
const defaultBenchmarkVersion = '2.0.0';
const defaultBenchmarkProfile = 'Level 1 - Server';

export const projectConfig = {
  frontendUrl: process.env.NEXT_PUBLIC_FRONTEND_URL || defaultFrontendUrl,
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || defaultBackendUrl,
  onlyOfficeUrl: process.env.NEXT_PUBLIC_ONLYOFFICE_URL || defaultOnlyOfficeUrl,
  benchmarkName: process.env.NEXT_PUBLIC_BENCHMARK_NAME || defaultBenchmarkName,
  benchmarkVersion: process.env.NEXT_PUBLIC_BENCHMARK_VERSION || defaultBenchmarkVersion,
  benchmarkProfile: process.env.NEXT_PUBLIC_BENCHMARK_PROFILE || defaultBenchmarkProfile,
} as const;

export const benchmarkLabel = `${projectConfig.benchmarkName} v${projectConfig.benchmarkVersion}`;
