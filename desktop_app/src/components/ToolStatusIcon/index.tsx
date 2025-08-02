interface ToolStatusIconProps {
  enabled: boolean;
}

export default function ToolStatusIcon({ enabled }: ToolStatusIconProps) {
  return <div className={`w-1.5 h-1.5 bg-${enabled ? 'green' : 'red'}-500 rounded-full`} />;
}
