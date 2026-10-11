import NoteApp from "./components/NoteApp";
import { passwordConfigured } from "@/lib/session";

export default function Page() {
  // App com senha: mostra o botao de sair na interface.
  return <NoteApp authEnabled={passwordConfigured()} />;
}