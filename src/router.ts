// ハッシュ形式のルーティング（GitHub Pages でリロードしても404にならない）
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'title' | 'opening' | 'floor' }
  | { name: 'hearing' | 'blueprint' | 'build' | 'verify' | 'report'; customerId: string };

export function parse(hash: string): Route {
  const [name, id] = hash.replace(/^#\/?/, '').split('/');
  if ((name === 'hearing' || name === 'blueprint' || name === 'build' || name === 'verify' || name === 'report') && id) return { name, customerId: id };
  if (name === 'opening' || name === 'floor') return { name };
  return { name: 'title' };
}

export function go(route: Route) {
  window.location.hash = 'customerId' in route ? `/${route.name}/${route.customerId}` : `/${route.name}`;
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
