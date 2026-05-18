import { VmOpsOperationPage } from '../../../components/vm-ops/VmOpsOperationPage';

export default function RemediatePage() {
  return (
    <VmOpsOperationPage
      operationType="REMEDIATION"
      title="🛠️ Remediate"
      description="Chọn source audit job M1-M4, sau đó vá từng control FAIL hoặc vá toàn bộ các control FAIL trong một lần chạy."
    />
  );
}
