import { createRoot } from 'react-dom/client';

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastOptions {
  message: string;
  type?: ToastType;
  duration?: number;
}

const getAlertClass = (type: ToastType) => {
  switch (type) {
    case 'success':
      return 'alert-success';
    case 'warning':
      return 'alert-warning';
    case 'error':
      return 'alert-error';
    case 'info':
    default:
      return 'alert-info';
  }
};

export const toast = ({ message, type = 'info', duration = 3000 }: ToastOptions) => {
  // 创建 toast 容器
  const toastContainer = document.createElement('div');
  toastContainer.className = 'toast toast-top toast-end z-50';
  document.body.appendChild(toastContainer);

  // 创建 toast 元素
  const toastElement = (
    <div className={`alert ${getAlertClass(type)} shadow-lg`}>
      <span>{message}</span>
    </div>
  );

  // 渲染 toast
  const root = createRoot(toastContainer);
  root.render(toastElement);

  // 自动移除
  setTimeout(() => {
    root.unmount();
    document.body.removeChild(toastContainer);
  }, duration);
};

// 便捷方法
toast.success = (message: string, duration?: number) => 
  toast({ message, type: 'success', duration });

toast.error = (message: string, duration?: number) => 
  toast({ message, type: 'error', duration });

toast.warning = (message: string, duration?: number) => 
  toast({ message, type: 'warning', duration });

toast.info = (message: string, duration?: number) => 
  toast({ message, type: 'info', duration });
