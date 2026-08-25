// Compile-time check of the public API, run through `npm run types`
import tunnelLauncher = require('../../lib/tunnel-launcher');

const options: tunnelLauncher.TunnelOptions = {
    apiKey: 'key',
    apiSecret: 'secret',
    verbose: true,
    'se-port': 4445,
    timeout: 120,
    shared: true,
    noBump: false,
    tunnelIdentifier: 'my-tunnel',
    // Options the tunnel knows about but which are not listed explicitly
    'metrics-port': 8003
};

tunnelLauncher(options, (err, tunnel) => {
    if (err) {
        throw err;
    }
    tunnel?.close(() => {});
});

tunnelLauncher.kill(err => {
    if (err) {
        throw err;
    }
});

async function useAsyncApi(): Promise<void> {
    const tunnel: tunnelLauncher.TunnelProcess = await tunnelLauncher.downloadAndRunAsync(options);
    tunnel.close();

    await tunnelLauncher.downloadAsync(options);
    await tunnelLauncher.startTunnelAsync(options);
    await tunnelLauncher.killAsync();
    await tunnelLauncher.stopProcess(tunnel, 1000);

    const java: tunnelLauncher.JavaVersionResult = await tunnelLauncher.checkJava();
    const version: number | null = java.version;
    const validation: tunnelLauncher.JavaValidationResult = tunnelLauncher.validateJavaVersion('openjdk version "21"');

    const args: string[] = tunnelLauncher.createArgs(options);
    const redactedArgs: string[] = tunnelLauncher.redactCredentials(args, options);
    const redactedLine: string = tunnelLauncher.redactCredentials('some output', options);
    const env: NodeJS.ProcessEnv = tunnelLauncher.createEnv(options);

    const valid: boolean = await tunnelLauncher.isJarValid('tunnel.jar');
    const readyFile: string = await tunnelLauncher.createReadyFilePath();
    await tunnelLauncher.removeReadyFilePath(readyFile);

    tunnelLauncher.validateOptions(options);

    void [version, validation, redactedArgs, redactedLine, env, valid, tunnelLauncher.parseJavaVersion('')];
}

void useAsyncApi;
