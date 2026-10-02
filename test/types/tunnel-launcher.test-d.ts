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

// Options of TestingBot Tunnel 5.0 and up
const options5: tunnelLauncher.TunnelOptions = {
    tunnelVersion: '5.0',
    bindAddress: '0.0.0.0',
    logLevel: 'debug',
    logFormat: 'json',
    header: ['X-Test: 1', '-Cookie'],
    cacertFile: '/etc/ssl/corporate.pem',
    dnsTimeout: 10,
    dnsRoundRobin: true,
    sshHostKeyPolicy: 'require',
    'allow-hosts': 'example.com,*.example.com'
};

// Values read from the environment are plain strings
const fromEnvironment: string = process.env.BIND_ADDRESS || '127.0.0.1';
const options5FromEnvironment: tunnelLauncher.TunnelOptions = { bindAddress: fromEnvironment, logLevel: fromEnvironment };

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

    const jarLocation: string = await tunnelLauncher.downloadAsync(options);
    await tunnelLauncher.startTunnelAsync(options, jarLocation);
    await tunnelLauncher.killAsync();
    await tunnelLauncher.killAllAsync();

    const running: tunnelLauncher.TunnelProcess[] = tunnelLauncher.activeTunnels();
    await tunnelLauncher.stopProcess(tunnel, 1000);

    const java: tunnelLauncher.JavaVersionResult = await tunnelLauncher.checkJava();
    const version: number | null = java.version;
    const validation: tunnelLauncher.JavaValidationResult = tunnelLauncher.validateJavaVersion('openjdk version "21"');

    const args: string[] = tunnelLauncher.createArgs(options, jarLocation);
    const redactedArgs: string[] = tunnelLauncher.redactCredentials(args, options);
    const redactedLine: string = tunnelLauncher.redactCredentials('some output', options);
    const env: NodeJS.ProcessEnv = tunnelLauncher.createEnv(options);

    const valid: boolean = await tunnelLauncher.isJarValid('tunnel.jar');
    const readyFile: string = await tunnelLauncher.createReadyFilePath();
    await tunnelLauncher.removeReadyFilePath(readyFile);

    tunnelLauncher.validateOptions(options);

    const tunnelVersion: string | null = await tunnelLauncher.readJarVersion(jarLocation);
    tunnelLauncher.validateOptionsForVersion(options5, tunnelVersion);
    const isVersion5: boolean | null = tunnelLauncher.isVersion5OrUp(tunnelVersion);
    const java5: tunnelLauncher.JavaVersionResult = await tunnelLauncher.checkJava(tunnelLauncher.requiredJavaVersion('5.0'));
    const validation17: tunnelLauncher.JavaValidationResult = tunnelLauncher.validateJavaVersion('openjdk version "21"', 17);
    const lines: string[] = tunnelLauncher.parseLogLine('{"message":"hello"}');

    void [version, validation, redactedArgs, redactedLine, env, valid, running, tunnelLauncher.parseJavaVersion(''),
        isVersion5, java5, validation17, lines, options5FromEnvironment];
}

void useAsyncApi;
