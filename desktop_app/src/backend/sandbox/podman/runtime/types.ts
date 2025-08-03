export type PodmanMachineListOutput = {
  Name: string;
  Default: boolean;
  Created: string;
  Running: boolean;
  Starting: boolean;
  LastUp: string;
  Stream: string;
  VMType: string;
  CPUs: number;
  Memory: string;
  DiskSize: string;
  Port: number;
  RemoteUsername: string;
  IdentityPath: string;
  UserModeNetworking: boolean;
}[];

export type PodmanMachineInspectOutput = {
  ConfigDir: {
    Path: string;
  };
  ConnectionInfo: {
    PodmanSocket: {
      Path: string;
    };
    PodmanPipe: null;
  };
  Resources: {
    CPUs: number;
    DiskSize: number;
    Memory: number;
    USBs: string[];
  };
  SSHConfig: {
    IdentityPath: string;
    Port: number;
    RemoteUsername: string;
  };
  UserModeNetworking: boolean;
  Rootful: boolean;
  Rosetta: boolean;
}[];
