// ハッシュ形式のルーティング（GitHub Pages でリロードしても404にならない）
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'office' }
  | { name: 'blueprint' | 'sim' | 'report'; customerId: string };

export function parse(hash: string): Route {
  const [name, id] = hash.replace(/^#\/?/, '').split('/');
  if ((name === 'blueprint' || name === 'sim' || name === 'report') && id) return { name, customerId: id };
  return { name: 'office' };
}

export function go(route: Route) {
  window.location.hash = route.name === 'office' ? '/office' : `/${route.name}/${route.customerId}`;
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
