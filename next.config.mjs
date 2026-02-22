/** @type {import('next').NextConfig} */
const nextConfig = {
    // Webpack fallbacks for browser-incompatible Node.js modules
    // used by @noir-lang/backend_barretenberg and circomlibjs
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                path: false,
                crypto: false,
                os: false,
                worker_threads: false,
                stream: false,
                buffer: false,
            };
        }
        return config;
    },
};

export default nextConfig;
