interface ToolServerIconProps {
  toolServerName: string;
  widthHeightClassName?: string;
  textClassName?: string;
}

const getServerColor = (toolServerName: string) => {
  switch (toolServerName.toLowerCase()) {
    case 'gmail':
      return 'red';
    case 'slack':
      return 'purple';
    default:
      return 'blue';
  }
};

const getServerIcon = (toolServerName: string) => {
  switch (toolServerName.toLowerCase()) {
    case 'gmail':
      return 'M';
    case 'slack':
      return '#';
    default:
      return toolServerName.charAt(0).toUpperCase();
  }
};

export function ToolServerIcon({
  toolServerName,
  widthHeightClassName = 'w-6 h-6',
  textClassName = 'text-xs',
}: ToolServerIconProps) {
  return (
    <div
      className={`${widthHeightClassName} bg-${getServerColor(toolServerName)}-500 rounded-sm flex items-center justify-center`}
    >
      <span className={`text-white ${textClassName} font-bold`}>{getServerIcon(toolServerName)}</span>
    </div>
  );
}
