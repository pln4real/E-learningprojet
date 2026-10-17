import { redirect } from 'next/navigation';

// L'ancien catalogue est remplacé par l'accueil et les pages de classe.
export default function Catalogue() {
  redirect('/');
}
