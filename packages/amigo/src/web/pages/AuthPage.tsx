import { startTransition, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { authClient } from "../auth/client";

interface AuthPageProps {
  mode: "login" | "register";
}

const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPending && session?.user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "register") {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (result.error) {
          throw new Error(result.error.message || "注册失败");
        }
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          rememberMe: true,
        });
        if (result.error) {
          throw new Error(result.error.message || "登录失败");
        }
      }

      startTransition(() => {
        navigate("/", { replace: true });
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(17,24,39,0.08),_transparent_35%),linear-gradient(135deg,_#f8fafc,_#eef2ff_45%,_#fff7ed)] text-gray-900">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
        <div className="grid w-full overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl md:grid-cols-[1.1fr_0.9fr]">
          <div className="hidden bg-[linear-gradient(160deg,_#0f172a,_#1d4ed8_60%,_#38bdf8)] p-10 text-white md:flex md:flex-col md:justify-between">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-white/70">Amigo</p>
              <h1 className="max-w-sm text-4xl font-semibold leading-tight">
                {mode === "register" ? "创建你的工作台账号" : "登录后继续当前工作流"}
              </h1>
              <p className="max-w-sm text-sm leading-6 text-white/75">
                登录后，聊天记录、skills、automations 都会直接归属到你的账号，不再混用默认本地用户。
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 text-sm text-white/80">
              <div className="font-medium text-white">这次切换后的行为</div>
              <div className="mt-2 leading-6">
                只有已登录用户才能建立 websocket、查看自己的会话历史，以及管理自己的 skills 和
                automations。
              </div>
            </div>
          </div>

          <div className="p-8 sm:p-10">
            <div className="mx-auto max-w-sm">
              <div className="mb-8 space-y-2">
                <h2 className="text-2xl font-semibold">{mode === "register" ? "注册" : "登录"}</h2>
                <p className="text-sm text-gray-500">
                  {mode === "register"
                    ? "用邮箱和密码创建一个新的 Amigo 账号。"
                    : "使用你的邮箱和密码继续。"}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                {mode === "register" ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-gray-700">昵称</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="你的名字"
                      required
                    />
                  </label>
                ) : null}

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-gray-700">邮箱</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-gray-700">密码</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    placeholder="至少 8 位"
                    required
                  />
                </label>

                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || isPending}
                  className="w-full rounded-2xl bg-gray-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "提交中..." : mode === "register" ? "创建账号" : "登录"}
                </button>
              </form>

              <div className="mt-6 text-sm text-gray-500">
                {mode === "register" ? "已经有账号了？" : "还没有账号？"}{" "}
                <Link
                  className="font-medium text-blue-600 transition hover:text-blue-700"
                  to={mode === "register" ? "/login" : "/register"}
                >
                  {mode === "register" ? "去登录" : "去注册"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
