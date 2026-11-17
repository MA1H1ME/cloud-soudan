import { useEffect } from 'react';
import { useRoute } from './router';
import { bgm } from './sound';
import { useSave } from './store';
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
import { Exam } from './screens/Exam';
import { Achievements } from './screens/Achievements';
import { TermSheet } from './components/Term';

export function App() {
  return (
    <>
      <Bgm />
      <Transition />
      <TermSheet />
    </>
  );
}

/** BGM：設定がオンなら、会社があるときに流す（障害の対応中は曲が変わる。切り替えは Floor が行う） */
function Bgm() {
  const music = useSave((s) => s.music);
  const hasCompany = useSave((s) => Boolean(s.company));
  useEffect(() => {
    bgm.setEnabled(music);
    if (music && hasCompany) bgm.set('calm');
    else bgm.set('off');
    return () => bgm.set('off');
  }, [music, hasCompany]);
  return null;
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
    case 'exam':
      return <Exam />;
    case 'achievements':
      return <Achievements />;
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
