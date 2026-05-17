import { VmOpsOperationPage } from '../../../components/vm-ops/VmOpsOperationPage';

export default function NotApplicableFixPage() {
  return (
    <VmOpsOperationPage
      operationType="NOT_APPLICABLE_FIX"
      title="🧩 Not Applicable Fix"
      description="Biến các control M1 đang ở trạng thái NOT_APPLICABLE sang PASS bằng cách bổ sung trạng thái hệ thống còn thiếu, hiện tập trung vào nhóm /tmp controls."
    />
  );
}
