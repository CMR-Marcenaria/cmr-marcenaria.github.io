import Link from "next/link";

export default function NaoEncontrada() {
  return (
    <div className="vazio">
      <p>Essa mesa não está mais disponível ou o endereço está errado.</p>
      <Link href="/" className="botao">Ver o catálogo</Link>
    </div>
  );
}
