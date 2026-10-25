import { SwedenSession } from "./SwedenSession";

type AppProps = {
  apiKey: string | null;
};

export function App({ apiKey }: AppProps) {
  return (
    <main className="app">
      <SwedenSession apiKey={apiKey} />
    </main>
  );
}
