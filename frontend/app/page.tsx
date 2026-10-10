import NoteApp from "./components/NoteApp";
import { passwordEnabled } from "@/lib/session";

export default function Page() {
  // App com senha: mostra o botao de sair na interface.
  return <NoteApp authEnabled={passwordEnabled()} />;
}