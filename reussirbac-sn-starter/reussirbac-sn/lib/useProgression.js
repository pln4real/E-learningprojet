'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// Progression de l'élève connecté : ressources terminées + meilleurs scores aux quiz.
// Sans compte (ou avant l'exécution du script SQL 06), tout reste simplement vide.
export function useProgression() {
  const [userId, setUserId] = useState(null);
  const [faits, setFaits] = useState(() => new Set());
  const [scores, setScores] = useState({}); // quiz_id -> { score, total }
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let actif = true;
    async function charger() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (actif) setPret(true); return; }
      const [prog, res] = await Promise.all([
        supabase.from('progression_utilisateur').select('ressource_id, vu').eq('user_id', user.id),
        supabase.from('quiz_resultats').select('quiz_id, score, total').eq('user_id', user.id),
      ]);
      if (!actif) return;
      setUserId(user.id);
      if (!prog.error && prog.data) setFaits(new Set(prog.data.filter((p) => p.vu).map((p) => p.ressource_id)));
      if (!res.error && res.data) {
        const best = {};
        res.data.forEach((r) => {
          const b = best[r.quiz_id];
          if (!b || r.score / r.total > b.score / b.total) best[r.quiz_id] = { score: r.score, total: r.total };
        });
        setScores(best);
      }
      setPret(true);
    }
    charger();
    return () => { actif = false; };
  }, []);

  const marquer = useCallback(async (ressourceId, fait) => {
    if (!userId) return;
    // mise à jour immédiate de l'écran, puis enregistrement
    setFaits((prev) => { const n = new Set(prev); if (fait) n.add(ressourceId); else n.delete(ressourceId); return n; });
    const { error } = fait
      ? await supabase.from('progression_utilisateur').upsert({ user_id: userId, ressource_id: ressourceId, vu: true, vu_le: new Date().toISOString() })
      : await supabase.from('progression_utilisateur').delete().eq('user_id', userId).eq('ressource_id', ressourceId);
    if (error) {
      setFaits((prev) => { const n = new Set(prev); if (fait) n.delete(ressourceId); else n.add(ressourceId); return n; });
    }
  }, [userId]);

  const noterQuiz = useCallback((quizId, score, total) => {
    setScores((prev) => {
      const b = prev[quizId];
      if (b && b.score / b.total >= score / total) return prev;
      return { ...prev, [quizId]: { score, total } };
    });
  }, []);

  return { connecte: !!userId, userId, faits, scores, marquer, noterQuiz, pret };
}
