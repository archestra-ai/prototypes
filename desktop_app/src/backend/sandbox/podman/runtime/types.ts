export type PodmanMachine = {
  Name: string;
  State: string;
  Created: string;
  LastUp: string;
  ConfigDir: {
    Path: string;
  };
  ConnectionInfo: {
    PodmanSocket: {
      Path: string;
    };
    PodmanPipe: null;
  };

  // NOTE: for now we're not using these fields, but we can add them later if needed
  // Resources: {
  //   CPUs: number;
  //   DiskSize: number;
  //   Memory: number;
  //   USBs: string[];
  // };
  // SSHConfig: {
  //   IdentityPath: string;
  //   Port: number;
  //   RemoteUsername: string;
  // };

  // UserModeNetworking: boolean;
  // Rootful: boolean;
  // Rosetta: boolean;
};
