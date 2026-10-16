"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigurado } from "@/lib/supabase";
import { categoriaDe, fotoUrl, medidasTexto, precoTexto, STATUS_TEXTO, type Mesa, type Status } from "@/lib/mesas";

type Formulario = {
  codigo: string;
  nome: string;
  descricao: string;
  madeira: string;
  comprimento_cm: string;
  largura_cm: string;
  altura_cm: string;
  lugares: string;
  preco_a_vista: string;
  status: Status;
};

const VAZIO: Formulario = {
  codigo: "", nome: "", descricao: "", madeira: "", comprimento_cm: "", largura_cm: "",
  altura_cm: "", lugares: "", preco_a_vista: "", status: "disponivel",
};

/** Aceita "4800", "4.800,00" ou "4800.50". */
function paraNumero(texto: string): number | null {
  const t = texto.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

function doFormulario(m: Mesa): Formulario {
  const s = (v: number | string | null) => (v == null ? "" : String(v));
  return {
    codigo: m.codigo, nome: m.nome, descricao: s(m.descricao), madeira: s(m.madeira),
    comprimento_cm: s(m.comprimento_cm), largura_cm: s(m.largura_cm), altura_cm: s(m.altura_cm),
    lugares: s(m.lugares), preco_a_vista: s(m.preco_a_vista), status: m.status,
  };
}

/**
 * Reduz a foto no navegador antes de enviar: foto de celular tem 3–6 MB,
 * 1600px já basta para o catálogo e o upload fica rápido no 4G.
 */
function reduzirImagem(arquivo: File, larguraMax = 1600, qualidade = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    if (!arquivo.type.startsWith("image/") || /heic|heif/i.test(arquivo.type + arquivo.name)) return resolve(arquivo);
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    const desistir = setTimeout(() => resolve(arquivo), 15000);
    img.onload = () => {
      clearTimeout(desistir);
      const escala = Math.min(1, larguraMax / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b ?? arquivo), "image/jpeg", qualidade);
    };
    img.onerror = () => { clearTimeout(desistir); URL.revokeObjectURL(url); resolve(arquivo); };
    img.src = url;
  });
}

export default function Painel() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabaseConfigurado) { setCarregandoSessao(false); return; }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => { setSessao(data.session); setCarregandoSessao(false); });
    const { data } = sb.auth.onAuthStateChange((_evento, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) { setEhAdmin(null); return; }
    getSupabase().from("admins").select("user_id").eq("user_id", sessao.user.id).maybeSingle()
      .then(({ data }) => setEhAdmin(Boolean(data)));
  }, [sessao]);

  if (!supabaseConfigurado) {
    return <div className="caixa login"><h2>Painel indisponível</h2><p>O banco de dados (Supabase) ainda não foi conectado a este site.</p></div>;
  }
  if (carregandoSessao) return <p className="dica">Carregando…</p>;
  if (!sessao) return <Login />;
  if (ehAdmin === null) return <p className="dica">Conferindo acesso…</p>;
  if (!ehAdmin) {
    return (
      <div className="caixa login">
        <h2>Sem permissão</h2>
        <p>A conta {sessao.user.email} entrou, mas não está liberada para editar o catálogo.</p>
        <button className="botao secundario" onClick={() => getSupabase().auth.signOut()}>Sair</button>
      </div>
    );
  }
  return <Gestao email={sessao.user.email ?? ""} />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setEntrando(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
  };

  return (
    <form className="caixa login" onSubmit={entrar}>
      <h2>Painel do catálogo</h2>
      <div className="campos" style={{ gridTemplateColumns: "1fr" }}>
        <label className="campo">E-mail<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="campo">Senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
      </div>
      <div className="linha-botoes"><button className="botao" disabled={entrando}>{entrando ? "Entrando…" : "Entrar"}</button></div>
      {erro && <div className="msg-erro">{erro}</div>}
    </form>
  );
}

function Gestao({ email }: { email: string }) {
  const sb = getSupabase();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [editando, setEditando] = useState<Mesa | "nova" | null>(null);
  const [filtro, setFiltro] = useState<Status | "todas">("todas");
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await sb.from("mesas").select("*").order("criado_em", { ascending: false });
    if (error) setErro(error.message);
    else setMesas((data ?? []).map((m) => ({
      ...m,
      comprimento_cm: Number(m.comprimento_cm),
      largura_cm: Number(m.largura_cm),
      altura_cm: m.altura_cm == null ? null : Number(m.altura_cm),
      preco_a_vista: m.preco_a_vista == null ? null : Number(m.preco_a_vista),
    })) as Mesa[]);
  }, [sb]);

  useEffect(() => { carregar(); }, [carregar]);

  const mudarStatus = async (m: Mesa, status: Status) => {
    const { error } = await sb.from("mesas").update({ status }).eq("id", m.id);
    if (error) setErro(error.message); else carregar();
  };

  const apagar = async (m: Mesa) => {
    if (!confirm(`Apagar a mesa ${m.codigo} (${m.nome}) e as fotos dela? Isso não pode ser desfeito.`)) return;
    if (m.fotos.length) await sb.storage.from("fotos").remove(m.fotos);
    const { error } = await sb.from("mesas").delete().eq("id", m.id);
    if (error) setErro(error.message); else carregar();
  };

  const visiveis = mesas.filter((m) => filtro === "todas" || m.status === filtro);
  const contagem = (s: Status) => mesas.filter((m) => m.status === s).length;

  return (
    <>
      <div className="painel-topo">
        <div>
          <h1>Painel do catálogo</h1>
          <span className="dica">{email} · <a href="#" onClick={(e) => { e.preventDefault(); sb.auth.signOut(); }}>sair</a> · <a href="/" target="_blank">ver catálogo público</a></span>
        </div>
        {!editando && <button className="botao" onClick={() => setEditando("nova")}>+ Nova mesa</button>}
      </div>

      {erro && <div className="msg-erro" style={{ marginBottom: 14 }}>{erro}</div>}

      {editando ? (
        <FormMesa
          mesa={editando === "nova" ? null : editando}
          aoFechar={() => { setEditando(null); carregar(); }}
        />
      ) : (
        <>
          <nav className="filtros">
            <button className={`chip ${filtro === "todas" ? "ativo" : ""}`} onClick={() => setFiltro("todas")}>Todas ({mesas.length})</button>
            {(["disponivel", "reservado", "vendido"] as Status[]).map((s) => (
              <button key={s} className={`chip ${filtro === s ? "ativo" : ""}`} onClick={() => setFiltro(s)}>{STATUS_TEXTO[s]} ({contagem(s)})</button>
            ))}
          </nav>
          {visiveis.length === 0 ? (
            <div className="vazio">Nenhuma mesa aqui ainda. Toque em “+ Nova mesa” para cadastrar.</div>
          ) : (
            <div className="lista-admin">
              {visiveis.map((m) => (
                <div key={m.id} className={`item-admin ${m.status === "vendido" ? "vendido" : ""}`}>
                  <div className="foto">{m.fotos[0] ? <img src={fotoUrl(m.fotos[0])} alt="" /> : <span className="dica">sem foto</span>}</div>
                  <div>
                    <div className="codigo">{m.codigo}{categoriaDe(m.comprimento_cm) ? ` · Cat. ${categoriaDe(m.comprimento_cm)}` : ""} · {m.fotos.length} foto(s)</div>
                    <div className="nome">{m.nome}</div>
                    <div className="medidas">{medidasTexto(m)}</div>
                    <div><strong>{precoTexto(m.preco_a_vista)}</strong> <span className={`selo selo-${m.status}`}>{STATUS_TEXTO[m.status]}</span></div>
                  </div>
                  <div className="acoes">
                    <button className="botao pequeno" onClick={() => setEditando(m)}>Editar / fotos</button>
                    <select value={m.status} onChange={(e) => mudarStatus(m, e.target.value as Status)} aria-label="Situação">
                      <option value="disponivel">Disponível</option>
                      <option value="reservado">Reservada</option>
                      <option value="vendido">Vendida</option>
                    </select>
                    <button className="botao pequeno perigo" onClick={() => apagar(m)}>Apagar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function FormMesa({ mesa, aoFechar }: { mesa: Mesa | null; aoFechar: () => void }) {
  const sb = getSupabase();
  const [f, setF] = useState<Formulario>(mesa ? doFormulario(mesa) : VAZIO);
  const [fotos, setFotos] = useState<string[]>(mesa?.fotos ?? []);
  const [novas, setNovas] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const inputFotos = useRef<HTMLInputElement>(null);

  const campo = (k: keyof Formulario) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }),
  });

  const comprimento = paraNumero(f.comprimento_cm);
  const categoria = comprimento ? categoriaDe(comprimento) : null;

  const enviarFotos = async (mesaId: string, arquivos: File[]): Promise<string[]> => {
    const caminhos: string[] = [];
    for (let i = 0; i < arquivos.length; i++) {
      setProgresso(`Enviando foto ${i + 1} de ${arquivos.length}…`);
      const blob = await reduzirImagem(arquivos[i]);
      const ext = blob.type === "image/jpeg" ? "jpg" : (arquivos[i].name.split(".").pop() || "jpg").toLowerCase();
      const caminho = `${mesaId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("fotos").upload(caminho, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw new Error(`A foto ${arquivos[i].name} não subiu: ${error.message}`);
      caminhos.push(caminho);
    }
    setProgresso("");
    return caminhos;
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    const largura = paraNumero(f.largura_cm);
    if (!f.nome.trim() || !comprimento || !largura) {
      setErro("Preencha pelo menos nome, comprimento e largura.");
      return;
    }
    const lugares = paraNumero(f.lugares);
    const dados = {
      nome: f.nome.trim(),
      descricao: f.descricao.trim() || null,
      madeira: f.madeira.trim() || null,
      comprimento_cm: comprimento,
      largura_cm: largura,
      altura_cm: paraNumero(f.altura_cm),
      lugares: lugares == null ? null : Math.round(lugares),
      preco_a_vista: paraNumero(f.preco_a_vista),
      status: f.status,
      ...(f.codigo.trim() ? { codigo: f.codigo.trim().toUpperCase() } : {}),
    };

    setSalvando(true);
    try {
      let id = mesa?.id;
      if (id) {
        const { error } = await sb.from("mesas").update(dados).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("mesas").insert(dados).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      if (novas.length) {
        const enviadas = await enviarFotos(id!, novas);
        const todas = [...fotos, ...enviadas];
        const { error } = await sb.from("mesas").update({ fotos: todas }).eq("id", id!);
        if (error) throw error;
      }
      aoFechar();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e);
      setErro(msg.includes("duplicate key") ? "Já existe uma mesa com esse código." : msg);
      setProgresso("");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarFotos = async (lista: string[]) => {
    if (!mesa) return;
    const { error } = await sb.from("mesas").update({ fotos: lista }).eq("id", mesa.id);
    if (error) setErro(error.message); else setFotos(lista);
  };

  const removerFoto = async (caminho: string) => {
    if (!confirm("Remover esta foto?")) return;
    await sb.storage.from("fotos").remove([caminho]);
    await atualizarFotos(fotos.filter((x) => x !== caminho));
  };

  const virarCapa = (caminho: string) => atualizarFotos([caminho, ...fotos.filter((x) => x !== caminho)]);

  return (
    <form className="caixa" onSubmit={salvar}>
      <h2>{mesa ? `Editar ${mesa.codigo}` : "Nova mesa"}</h2>
      <div className="campos">
        <label className="campo largo">Nome da mesa *<input {...campo("nome")} placeholder="Ex.: Mesa rústica de peroba" required /></label>
        <label className="campo">Comprimento (cm) *<input {...campo("comprimento_cm")} inputMode="decimal" required /></label>
        <label className="campo">Largura (cm) *<input {...campo("largura_cm")} inputMode="decimal" required /></label>
        <label className="campo">Altura (cm)<input {...campo("altura_cm")} inputMode="decimal" /></label>
        <label className="campo">Lugares<input {...campo("lugares")} inputMode="numeric" /></label>
        <label className="campo">Valor à vista (R$)<input {...campo("preco_a_vista")} inputMode="decimal" placeholder="vazio = sob consulta" /></label>
        <label className="campo">Situação
          <select {...campo("status")}>
            <option value="disponivel">Disponível</option>
            <option value="reservado">Reservada</option>
            <option value="vendido">Vendida</option>
          </select>
        </label>
        <label className="campo">Madeira<input {...campo("madeira")} placeholder="Ex.: Peroba, demolição" /></label>
        <label className="campo">Código<input {...campo("codigo")} placeholder={mesa ? "" : "automático (CMR-001…)"} /></label>
        <label className="campo largo">Descrição<textarea {...campo("descricao")} placeholder="Detalhes que ajudam a vender: acabamento, pés, tipo de tampo…" /></label>
      </div>
      {categoria && <p className="dica">Pelo comprimento, esta mesa entra na categoria {categoria}.</p>}

      <h2 style={{ marginTop: 18 }}>Fotos</h2>
      {fotos.length > 0 && (
        <div className="fotos-edicao">
          {fotos.map((c, i) => (
            <div key={c} className="mini">
              <img src={fotoUrl(c)} alt="" />
              {i === 0 && <span className="capa">capa</span>}
              <div className="acoes-foto">
                {i > 0 && <button type="button" onClick={() => virarCapa(c)} title="Usar como capa">capa</button>}
                <button type="button" onClick={() => removerFoto(c)} title="Remover">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <input ref={inputFotos} type="file" accept="image/*" multiple onChange={(e) => setNovas(Array.from(e.target.files ?? []))} />
        {novas.length > 0 && <p className="dica">{novas.length} foto(s) nova(s) serão enviadas ao salvar.</p>}
      </div>

      <div className="linha-botoes">
        <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        <button type="button" className="botao secundario" onClick={aoFechar} disabled={salvando}>Cancelar</button>
        {progresso && <span className="dica">{progresso}</span>}
      </div>
      {erro && <div className="msg-erro">{erro}</div>}
    </form>
  );
}
