import { useRoute } from './router';
import { Office } from './screens/Office';
import { BlueprintScreen } from './screens/Blueprint';
import { Sim } from './screens/Sim';
import { Report } from './screens/Report';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'blueprint':
      return <BlueprintScreen customerId={route.customerId} />;
    case 'sim':
      return <Sim key={route.customerId} customerId={route.customerId} />;
    case 'report':
      return <Report customerId={route.customerId} />;
    default:
      return <Office />;
  }
}
