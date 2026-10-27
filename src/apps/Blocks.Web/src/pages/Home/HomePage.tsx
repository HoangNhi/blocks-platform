import { useAuth } from "@/hooks/useAuth";

const HomePage = () => {
  const { user } = useAuth();
  const name = user?.Fullname?.trim();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-normal text-slate-800">
        Xin chào{name ? `, ${name}` : ""}
      </h1>
    </div>
  );
};

export default HomePage;
