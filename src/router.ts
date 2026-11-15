// ハッシュ形式のルーティング（GitHub Pages でリロードしても404にならない）
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'consult'; scenarioId: string }
  | { name: 'result'; scenarioId: string }
  | { name: 'explain'; scenarioId: string };

export function parse(hash: string): Route {
  const [name, id] = hash.replace(/^#\/?/, '').split('/');
  if ((name === 'consult' || name === 'result' || name === 'explain') && id) return { name, scenarioId: id };
  return { name: 'home' };
}

export function go(route: Route) {
  window.location.hash = route.name === 'home' ? '/home' : `/${route.name}/${route.scenarioId}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
