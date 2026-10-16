import Link from "next/link";
import { FAIXAS, categoriaDe, faixaTexto, fotoUrl, listarMesas, medidasTexto, modoDemonstracao, precoTexto, STATUS_TEXTO } from "@/lib/mesas";

export const dynamic = "force-dynamic";

export default async function Catalogo({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  const cat = categoria ? Number(categoria) : undefined;
  const mesas = await listarMesas({ categoria: cat });

  return (
    <>
      {modoDemonstracao && (
        <div className="aviso-demo">Modo demonstração: estas mesas são exemplos. Conecte o Supabase para mostrar o catálogo real.</div>
      )}
      <h1>Catálogo de mesas</h1>
      <p className="subtitulo">Peças prontas para entrega. Toque numa mesa para ver fotos e detalhes.</p>

      <nav className="filtros" aria-label="Filtrar por tamanho">
        <Link href="/" className={`chip ${!cat ? "ativo" : ""}`}>Todas</Link>
        {FAIXAS.map((f) => (
          <Link key={f.categoria} href={`/?categoria=${f.categoria}`} className={`chip ${cat === f.categoria ? "ativo" : ""}`}>
            {faixaTexto(f.categoria)}
          </Link>
        ))}
      </nav>

      {mesas.length === 0 ? (
        <div className="vazio">Nenhuma mesa disponível nesse tamanho no momento. Fale com a gente: fazemos sob medida.</div>
      ) : (
        <div className="grade">
          {mesas.map((m) => (
            <Link key={m.id} href={`/mesa/${encodeURIComponent(m.codigo)}`} className="cartao">
              <div className="foto">
                {m.fotos[0] ? <img src={fotoUrl(m.fotos[0])} alt={m.nome} loading="lazy" /> : <span>Foto em breve</span>}
              </div>
              <div className="cartao-corpo">
                <span className="codigo">{m.codigo}{categoriaDe(m.comprimento_cm) ? ` · Categoria ${categoriaDe(m.comprimento_cm)}` : ""}</span>
                <span className="nome">{m.nome}</span>
                <span className="medidas">{medidasTexto(m)}{m.lugares ? ` · ${m.lugares} lugares` : ""}</span>
                <span className={`selo selo-${m.status}`}>{STATUS_TEXTO[m.status]}</span>
                <span className="preco">{precoTexto(m.preco_a_vista)} {m.preco_a_vista != null && <small>à vista</small>}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
