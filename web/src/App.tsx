import { Shell } from "./components/Shell";

export default function App() {
  return (
    <Shell>
      <h1
        className="text-3xl font-bold mb-4"
        style={{ fontFamily: "Fraunces, serif" }}
      >
        Welcome to APPNAME
      </h1>
      <p style={{ color: "var(--muted)" }}>
        Edit <code>src/App.tsx</code> to get started.
      </p>
    </Shell>
  );
}
