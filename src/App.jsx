import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import Auth from "./screens/Auth";
import CharacterSelect from "./screens/CharacterSelect";
import Game from "./screens/Game";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [characterId, setCharacterId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) setCharacterId(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <Auth />;
  if (!characterId) return <CharacterSelect onEnter={setCharacterId} />;
  return <Game characterId={characterId} onExit={() => setCharacterId(null)} />;
}
