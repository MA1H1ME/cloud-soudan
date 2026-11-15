import { useRoute } from './router';
import { Home } from './screens/Home';
import { Consult } from './screens/Consult';
import { Result } from './screens/Result';
import { Explain } from './screens/Explain';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'consult':
      return <Consult key={route.scenarioId} scenarioId={route.scenarioId} />;
    case 'result':
      return <Result scenarioId={route.scenarioId} />;
    case 'explain':
      return <Explain scenarioId={route.scenarioId} />;
    default:
      return <Home />;
  }
}
