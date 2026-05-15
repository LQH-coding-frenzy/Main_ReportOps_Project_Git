export type LabVmHardwareProfile = {
  machineType: string;
  vcpu: number;
  memoryGb: number;
  monthlyCost: string;
  label: string;
  note: string;
};

export const LAB_VM_MACHINE_TYPES: LabVmHardwareProfile[] = [
  {
    machineType: 'e2-small',
    vcpu: 0.5,
    memoryGb: 2,
    monthlyCost: '~$12/mo',
    label: 'e2-small',
    note: 'Minimum stable profile',
  },
  {
    machineType: 'e2-medium',
    vcpu: 1,
    memoryGb: 4,
    monthlyCost: '~$24/mo',
    label: 'e2-medium',
    note: 'Recommended for normal audits',
  },
  {
    machineType: 'e2-standard-2',
    vcpu: 2,
    memoryGb: 8,
    monthlyCost: '~$48/mo',
    label: 'e2-standard-2',
    note: 'Best for repeated jobs and debugging',
  },
];

const HARDWARE_PROFILE_MAP = new Map(LAB_VM_MACHINE_TYPES.map((profile) => [profile.machineType, profile]));

export function getLabVmHardwareProfile(machineType: string): LabVmHardwareProfile | null {
  return HARDWARE_PROFILE_MAP.get(machineType) || null;
}
