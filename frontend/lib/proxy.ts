const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  // Nao faz sentido propagar; o undici rejeita ("expect header not supported").
  "expect",
]);

function backendOrigin(): string {
  return (process.env.BACKEND_URL ?? "http://127.0.0.1:3010").replace(/\/+$/, "");
}

function buildHeaders(request: Request): Headers {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  // O token vive apenas no servidor do frontend: nunca chega ao navegador.
  const token = process.env.BACKEND_TOKEN?.trim();
  if (token) headers.set("authorization", `Bearer ${token}`);

  return headers;
}

// Proxy transparente do navegador para o backend, injetando o token de API.
export async function proxyToBackend(
  request: Request,
  segments: string[] = [],
): Promise<Response> {
  const path = segments.map(encodeURIComponent).join("/");
  const search = new URL(request.url).search;
  const target = `${backendOrigin()}/${path}${search}`;
  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";

  // O corpo e lido em memoria: com multipart (uploads) o streaming direto do
  // Web Stream nao e suportado pelo fetch do Next em todos os cenarios.
  let body: Blob | undefined;
  if (hasBody) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) {
      const contentType = request.headers.get("content-type") ?? "";
      body = new Blob([buffer], { type: contentType });
    }
  }

  const init: RequestInit = {
    method,
    headers: buildHeaders(request),
    body,
    cache: "no-store",
    redirect: "manual",
  };

try {
    return await fetch(target, init);
  } catch (error) {
    console.error("[proxy] falha ao encaminhar para o backend", error);
    return new Response(JSON.stringify({ error: "Backend indisponivel" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}