import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { MotionCanvas } from "@/features/system/components/MotionCanvas";
import { useAuth } from "@/hooks/useAuth";

const formSchema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

const FONT_SANS =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const LoginPage = (): React.JSX.Element => {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const isSubmittingRef = useRef(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>): Promise<void> => {
    try {
      const result = await login(values.username, values.password);
      if (!result.Success) {
        toast.error(result.Message || "Đăng nhập thất bại");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng nhập thất bại");
    }
  };

  const onFormSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    try {
      await form.handleSubmit(onSubmit)(event);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div
      style={{ fontFamily: FONT_SANS }}
      className="relative min-h-svh flex flex-col bg-slate-50 selection:bg-blue-600 selection:text-white"
    >
      <MotionCanvas />

      <div className="h-4 sm:h-8" aria-hidden="true" />

      <main className="relative z-10 max-w-[440px] mx-auto w-full px-4 sm:px-6 my-auto py-6 sm:py-10">
        <div className="bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl shadow-blue-900/5 p-6 sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/blocks.png"
                alt=""
                className="size-10 object-contain rounded-xl"
                aria-hidden="true"
              />
              <span className="font-semibold text-lg text-slate-900 tracking-tight">
                Blocks Studio
              </span>
            </div>
            <span
              aria-hidden="true"
              style={{ fontFamily: FONT_MONO }}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60"
            >
              v2.4
            </span>
          </div>

          <div className="mt-6 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Đăng nhập Blocks Studio
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 leading-relaxed">
              Nơi mỗi ý tưởng trở thành một Microservice độc lập.
            </p>
          </div>

          <Form {...form}>
            <form
              aria-label="Đăng nhập Blocks Studio"
              aria-busy={form.formState.isSubmitting}
              onSubmit={onFormSubmit}
              className="flex flex-col gap-4"
            >
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-medium text-xs sm:text-sm">
                      Tên tài khoản
                    </FormLabel>
                    <div className="relative">
                      <UserRound
                        className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <FormControl>
                        <Input
                          placeholder="Tên tài khoản của bạn"
                          autoComplete="username"
                          className="pl-9 bg-white dark:bg-white text-slate-900 dark:text-slate-900 border-slate-200 dark:border-slate-200 placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-blue-600/20"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 font-medium text-xs sm:text-sm">
                      Mật khẩu
                    </FormLabel>
                    <div className="relative">
                      <LockKeyhole
                        className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          style={
                            !showPassword ? { fontFamily: FONT_MONO } : undefined
                          }
                          className="pl-9 pr-10 bg-white dark:bg-white text-slate-900 dark:text-slate-900 border-slate-200 dark:border-slate-200 placeholder:text-slate-400 focus-visible:border-blue-600 focus-visible:ring-blue-600/20"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={
                          showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                        }
                        title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        aria-pressed={showPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 rounded p-0.5"
                      >
                        {showPassword ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between gap-2 flex-wrap text-xs sm:text-sm">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <span>Ghi nhớ đăng nhập</span>
                </label>
                <button
                  type="button"
                  onClick={() => {}}
                  className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30 rounded"
                >
                  Quên mật khẩu?
                </button>
              </div>

              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full h-10 font-medium text-white bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af] dark:bg-[#2563eb] dark:hover:bg-[#1d4ed8] dark:active:bg-[#1e40af] dark:text-white rounded-lg shadow-sm transition-colors"
              >
                {form.formState.isSubmitting ? (
                  <>
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Đang đăng nhập…</span>
                  </>
                ) : (
                  <>
                    <span>Đăng nhập Studio</span>
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>
          </Form>

          <div className="relative my-5">
            <div
              className="absolute inset-0 flex items-center"
              aria-hidden="true"
            >
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white/95 px-2 text-slate-400 font-medium tracking-wider">
                Hoặc đăng nhập nhanh qua
              </span>
            </div>
          </div>

          {/* ponytail: GitHub, Blocks SSO, recovery, and remember checkbox are local/noop placeholders. Upgrade when OAuth/SSO, self-service password recovery, or persistent remember-me policy is requested. */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {}}
              className="w-full bg-white dark:bg-white border-slate-200 dark:border-slate-200 text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-50"
            >
              <UserRound
                className="size-4 text-slate-500"
                aria-hidden="true"
              />
              <span>GitHub</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {}}
              className="w-full bg-white dark:bg-white border-slate-200 dark:border-slate-200 text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-50"
            >
              <div
                className="size-2 rounded-full bg-blue-600"
                aria-hidden="true"
              />
              <span>Blocks SSO</span>
            </Button>
          </div>
        </div>
      </main>

      <footer className="relative z-10 w-full py-4 px-4 text-center text-xs text-slate-400">
        <div className="inline-flex items-center justify-center gap-2">
          <span
            className="size-2 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
          <span>
            © {new Date().getFullYear()} Blocks Platform. Modular Microservices
            Ecosystem.
          </span>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;
