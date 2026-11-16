import { useRoute } from './router';
import { Title } from './screens/Title';
import { Opening } from './screens/Opening';
import { Floor } from './screens/Floor';
import { BlueprintScreen } from './screens/Blueprint';
import { Report } from './screens/Report';
import { Hearing } from './screens/Hearing';
import { Build } from './screens/Build';
import { Verify } from './screens/Verify';
import { SpotScreen } from './screens/Spot';
import { Record } from './screens/Record';
import { Glossary } from './screens/Glossary';
import { TermSheet } from './components/Term';

export function App() {
  return (
    <>
      <Routes />
      <TermSheet />
    </>
  );
}

function Routes() {
  const route = useRoute();
  switch (route.name) {
    case 'opening':
      return <Opening />;
    case 'floor':
      return <Floor />;
    case 'spot':
      return <SpotScreen key={route.spotId} spotId={route.spotId} practice={route.practice} />;
    case 'record':
      return <Record />;
    case 'glossary':
      return <Glossary />;
    case 'hearing':
      return <Hearing customerId={route.customerId} />;
    case 'build':
      return <Build customerId={route.customerId} />;
    case 'verify':
      return <Verify customerId={route.customerId} />;
    case 'blueprint':
      return <BlueprintScreen customerId={route.customerId} />;
    case 'report':
      return <Report customerId={route.customerId} />;
    default:
      return <Title />;
  }
}
