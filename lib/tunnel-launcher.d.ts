import { ChildProcess } from 'child_process';

/**
 * Download and launch the TestingBot Tunnel (callback version)
 */
declare function downloadAndRun(
    options: downloadAndRun.TunnelOptions,
    callback: (err: Error | null, tunnel?: downloadAndRun.TunnelProcess) => void
): void;

declare namespace downloadAndRun {
    export interface TunnelOptions {
        /** TestingBot API key */
        apiKey?: string;
        /** TestingBot API secret */
        apiSecret?: string;
        /** Enable verbose output */
        verbose?: boolean;
        /** Port for the Selenium relay (default: 4445) */
        'se-port'?: number;
        /** Upstream proxy host and port (e.g. "localhost:1234") */
        proxy?: string;
        /** Comma-separated list of domains to bypass the tunnel */
        'fast-fail-regexps'?: string;
        /** Path to write log output */
        logfile?: string;
        /** Specific tunnel version to use */
        tunnelVersion?: string;
        /** Unique identifier for this tunnel */
        tunnelIdentifier?: string;
        /** Share tunnel with team members */
        shared?: boolean;
        /** Timeout in seconds for tunnel to start (default: 90) */
        timeout?: number;
        /** Disable SSL bumping/rewriting */
        noBump?: boolean;
        /** Disable caching */
        noCache?: boolean;
        /** Enable debug messages */
        debug?: boolean;
        /** Use a custom DNS server (e.g. "8.8.8.8") */
        dns?: string;
        /** Basic authentication for specific hosts ("host:port:user:passwd") */
        auth?: string;
        /** Username and password for the upstream proxy ("user:pwd") */
        'proxy-userpwd'?: string;
        /** Proxy autoconfiguration, an http(s) URL */
        pac?: string;
        /** Connect to port 80 on the hub instead of the default port 4444 */
        hubport?: number;
        /** Port to launch the local proxy on (default: 8087) */
        localproxy?: number;
        /** Do not start the local proxy */
        noproxy?: boolean;
        /**
         * Any other option is passed on to the tunnel as `--option value`.
         * Booleans are passed as a flag without a value.
         */
        [option: string]: string | number | boolean | undefined;
    }

    export interface TunnelProcess extends ChildProcess {
        /** Close the tunnel */
        close(callback?: () => void): void;
        /** Error message if tunnel failed to start */
        error?: string;
    }

    export interface JavaVersionResult {
        version: number | null;
    }

    export interface JavaValidationResult {
        valid: boolean;
        version: number | null;
        error: string | null;
    }

    /**
     * Kill the active tunnel (callback version)
     */
    export function kill(callback?: (err: Error | null) => void): void;

    /**
     * Download and launch the TestingBot Tunnel (async version)
     */
    export function downloadAndRunAsync(options?: TunnelOptions): Promise<TunnelProcess>;

    /**
     * Kill the tunnel that was started last (async version).
     * Resolves once the tunnel process has really exited.
     */
    export function killAsync(): Promise<void>;

    /**
     * Kill every tunnel this process started (async version).
     * Resolves once all of them have really exited.
     */
    export function killAllAsync(): Promise<void>;

    /**
     * Every tunnel this process started that is still running,
     * in the order they were started
     */
    export function activeTunnels(): TunnelProcess[];

    /**
     * Download the tunnel JAR file, returns the location of the jar
     */
    export function downloadAsync(options?: TunnelOptions): Promise<string>;

    /**
     * Start the tunnel process (requires JAR to be downloaded first).
     * Defaults to the jar that was downloaded last.
     */
    export function startTunnelAsync(options?: TunnelOptions, jarLocation?: string): Promise<TunnelProcess>;

    /**
     * Check if Java is installed and meets minimum version requirement
     */
    export function checkJava(): Promise<JavaVersionResult>;

    /**
     * Parse Java version from version output string
     */
    export function parseJavaVersion(versionOutput: string): number | null;

    /**
     * Validate Java version meets minimum requirement
     */
    export function validateJavaVersion(versionOutput: string): JavaValidationResult;

    /**
     * Validate options object
     * @throws {Error} If options are invalid
     */
    export function validateOptions(options: TunnelOptions): void;

    /**
     * Create command line arguments from options.
     * The API key and secret are not included, they are passed
     * to the tunnel through the environment.
     */
    export function createArgs(options: TunnelOptions, jarLocation?: string): string[];

    /**
     * Create the environment for the tunnel process, holding the
     * TESTINGBOT_KEY and TESTINGBOT_SECRET variables
     */
    export function createEnv(options: TunnelOptions): NodeJS.ProcessEnv;

    /**
     * Replace the API key and secret in a string or argument list with a placeholder
     */
    export function redactCredentials(value: string, options: TunnelOptions): string;
    export function redactCredentials(value: string[], options: TunnelOptions): string[];

    /**
     * Read a stream chunk by chunk and hand out whole lines
     */
    export function createLineReader(onLine: (line: string) => void): {
        (chunk: string | Buffer): void;
        flush(): void;
    };

    /**
     * Check whether a cached jar file can be run
     */
    export function isJarValid(jarLocation: string): Promise<boolean>;

    /**
     * The directory of this package, the first place the jar is kept
     */
    export function packageDirectory(): string;

    /**
     * The directory the jar is kept in when this package can not be written to.
     * Can be set with the TESTINGBOT_TUNNEL_CACHE_DIR environment variable.
     */
    export function cacheDirectory(): string;

    /**
     * Check whether a directory can be written to
     */
    export function isWritableDirectory(directory: string): boolean;

    /**
     * All places a jar can be kept, in the order they are looked at
     */
    export function jarLocations(jarName: string): string[];

    /**
     * The place to download a jar to: the first directory that can be written to
     * @throws {Error} If none of the locations can be written to
     */
    export function writableJarLocation(jarName: string, locations?: string[]): string;

    /**
     * Create the path for the readyfile of a single tunnel, in a private directory
     */
    export function createReadyFilePath(): Promise<string>;

    /**
     * Remove the private directory holding the readyfile
     */
    export function removeReadyFilePath(readyFile: string): Promise<void>;

    /**
     * Stop a process and wait until it has exited,
     * sending SIGKILL when it does not stop within the grace period
     */
    export function stopProcess(proc: ChildProcess, gracePeriod?: number): Promise<void>;
}

export = downloadAndRun;
