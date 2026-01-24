import { ChildProcess } from 'child_process';

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
 * Download and launch the TestingBot Tunnel (callback version)
 */
declare function downloadAndRun(
    options: TunnelOptions,
    callback: (err: Error | null, tunnel?: TunnelProcess) => void
): void;

declare namespace downloadAndRun {
    /**
     * Kill the active tunnel (callback version)
     */
    export function kill(callback?: (err: Error | null) => void): void;

    /**
     * Download and launch the TestingBot Tunnel (async version)
     */
    export function downloadAndRunAsync(options?: TunnelOptions): Promise<TunnelProcess>;

    /**
     * Kill the active tunnel (async version)
     */
    export function killAsync(): Promise<void>;

    /**
     * Download the tunnel JAR file
     */
    export function downloadAsync(options?: TunnelOptions): Promise<void>;

    /**
     * Start the tunnel process (requires JAR to be downloaded first)
     */
    export function startTunnelAsync(options?: TunnelOptions): Promise<TunnelProcess>;

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
     * Create command line arguments from options
     */
    export function createArgs(options: TunnelOptions): string[];
}

export = downloadAndRun;
