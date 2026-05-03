import './globals.css';

export const metadata = {
  title: 'CareLearn Pro - UK Care Home Training',
  description: 'CQC-compliant training platform for care home staff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
