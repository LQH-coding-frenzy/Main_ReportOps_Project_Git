import { VmOpsOperationPage } from '../../../components/vm-ops/VmOpsOperationPage';

export default function ReverseRemediatePage() {
  return (
    <VmOpsOperationPage
      operationType="REVERSE_REMEDIATE"
      title="↩️ Reverse Remediate"
      description="Chọn các control M1 đang PASS để cố ý đưa chúng về trạng thái fail phục vụ lab/demo, nhưng vẫn giữ an toàn cho tài khoản audit runner."
    />
  );
}
