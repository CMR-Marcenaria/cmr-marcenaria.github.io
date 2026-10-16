import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buscarMesa, categoriaDe, faixaTexto, fotoUrl, medidasTexto, precoTexto, STATUS_TEXTO } from "@/lib/mesas";
import { linkWhatsApp } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ foto?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mesa = await buscarMesa(decodeURIComponent((await params).codigo));
  if (!mesa) return { title: "Mesa não encontrada — CMR Marcenaria" };
  return {
    title: `${mesa.nome} (${mesa.codigo}) — CMR Marcenaria`,
    description: `${medidasTexto(mesa)} · ${precoTexto(mesa.preco_a_vista)} à vista`,
    openGraph: mesa.fotos[0] ? { images: [fotoUrl(mesa.fotos[0])] } : undefined,
  };
}

export default async function PaginaMesa({ params, searchParams }: Props) {
  const mesa = await buscarMesa(decodeURIComponent((await params).codigo));
  if (!mesa || mesa.status === "vendido") notFound();

  const indice = Math.min(Math.max(Number((await searchParams).foto ?? 0) || 0, 0), Math.max(mesa.fotos.length - 1, 0));
  const categoria = categoriaDe(mesa.comprimento_cm);
  const whats = linkWhatsApp(`Olá! Tenho interesse na mesa ${mesa.codigo} (${mesa.nome}, ${medidasTexto(mesa)}).`);

  return (
    <>
      <Link href="/" className="voltar">← Voltar ao catálogo</Link>
      <div className="detalhe">
        <div className="galeria">
          <div className="principal foto">
            {mesa.fotos[indice] ? <img src={fotoUrl(mesa.fotos[indice])} alt={mesa.nome} /> : <span>Foto em breve</span>}
          </div>
          {mesa.fotos.length > 1 && (
            <div className="miniaturas">
              {mesa.fotos.map((f, i) => (
                <Link key={f} href={`?foto=${i}`} scroll={false} aria-label={`Foto ${i + 1}`}>
                  <img src={fotoUrl(f)} alt="" loading="lazy" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="ficha">
          <span className="codigo">{mesa.codigo}</span>
          <h1>{mesa.nome}</h1>
          <span className={`selo selo-${mesa.status}`}>{STATUS_TEXTO[mesa.status]}</span>
          {mesa.descricao && <p style={{ margin: 0 }}>{mesa.descricao}</p>}
          <dl>
            <dt>Medidas</dt><dd>{medidasTexto(mesa)}</dd>
            {categoria && (<><dt>Categoria</dt><dd>{categoria} ({faixaTexto(categoria)})</dd></>)}
            {mesa.lugares && (<><dt>Lugares</dt><dd>{mesa.lugares}</dd></>)}
            {mesa.madeira && (<><dt>Madeira</dt><dd>{mesa.madeira}</dd></>)}
          </dl>
          <div className="preco">{precoTexto(mesa.preco_a_vista)} {mesa.preco_a_vista != null && <small>à vista</small>}</div>
          {whats && <a className="botao whats" href={whats} target="_blank" rel="noopener noreferrer">Quero esta mesa (WhatsApp)</a>}
        </div>
      </div>
    </>
  );
}
