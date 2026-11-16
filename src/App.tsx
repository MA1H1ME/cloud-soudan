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
import { Mail } from './screens/Mail';
import { CompanyScreen } from './screens/Company';
import { Ending } from './screens/Ending';
import { Transfer } from './screens/Transfer';
import { TermSheet } from './components/Term';

export function App() {
  return (
    <>
      <Transition />
      <TermSheet />
    </>
  );
}

/** 画面ごとに切り替えの演出をかける（月次報告は暗転、ほかは横から入る） */
function Transition() {
  const route = useRoute();
  const key = 'customerId' in route ? `${route.name}/${route.customerId}` : route.name === 'spot' ? `spot/${route.spotId}` : route.name;
  return (
    <div key={key} className={route.name === 'report' || route.name === 'ending' ? 'screen-dark' : 'screen-in'}>
      <Routes />
    </div>
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
    case 'mail':
      return <Mail />;
    case 'company':
      return <CompanyScreen />;
    case 'ending':
      return <Ending />;
    case 'transfer':
      return <Transfer />;
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
