import NoteApp from "./components/NoteApp";
import { passwordConfigured } from "@/lib/session";

// Renderizada por requisicao: APP_PASSWORD chega no ambiente em runtime
// (no container via `env_file`), e nao fica congelada no build.
export const dynamic = "force-dynamic";

export default function Page() {
  // App com senha: mostra o botao de sair na interface.
  return <NoteApp authEnabled={passwordConfigured()} />;
}