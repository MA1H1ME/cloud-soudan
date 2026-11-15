import { useRoute } from './router';
import { Title } from './screens/Title';
import { Opening } from './screens/Opening';
import { Floor } from './screens/Floor';
import { BlueprintScreen } from './screens/Blueprint';
import { Report } from './screens/Report';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'opening':
      return <Opening />;
    case 'floor':
      return <Floor />;
    case 'blueprint':
      return <BlueprintScreen customerId={route.customerId} />;
    case 'report':
      return <Report customerId={route.customerId} />;
    default:
      return <Title />;
  }
}
