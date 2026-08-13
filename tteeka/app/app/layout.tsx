import { ProtectedApp } from '@/components/protected-app'
import { MerchantWorkspaceProvider } from '@/components/merchant-workspace-provider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedApp><MerchantWorkspaceProvider>{children}</MerchantWorkspaceProvider></ProtectedApp>
}
