import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon.ico" />
        <meta name="theme-color" content="#180e2c" />
        <meta name="color-scheme" content="dark" />
        <meta name="description" content="Home ChatBot - Your personal AI assistant" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
