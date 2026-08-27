import { LoginForm } from "@/client/login-form";

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark" aria-hidden="true">S</div>
        <p className="eyebrow">DISCOTHÈQUE PRIVÉE</p>
        <h1>Streamall</h1>
        <p>Votre bibliothèque, vos sources, votre écoute.</p>
        <LoginForm />
      </section>
    </main>
  );
}
