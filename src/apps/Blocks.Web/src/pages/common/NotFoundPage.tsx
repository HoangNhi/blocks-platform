import type { FC } from "react";
import { Link } from "react-router-dom";

const NotFoundPage: FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-800">
        Trang không tồn tại
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Đường dẫn bạn yêu cầu không tồn tại hoặc đã bị xóa.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
      >
        Về trang chủ
      </Link>
    </div>
  );
};

export default NotFoundPage;
