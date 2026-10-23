import { CityMap } from "../map/CityMap";
import { CandidateNote } from "../ui/CandidateNote";
import { ConfigScreen } from "../ui/ConfigScreen";

type AppProps = {
  apiKey: string | null;
};

export function App({ apiKey }: AppProps) {
  return (
    <main className="app">
      <CandidateNote />
      {apiKey ? (
        <CityMap
          apiKey={apiKey}
          onRetry={() => {
            window.location.reload();
          }}
        />
      ) : (
        <ConfigScreen />
      )}
    </main>
  );
}
