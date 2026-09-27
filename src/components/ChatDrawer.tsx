import React from 'react';
import { ChatMessage, RoomPresenceData, UserRole } from '../types/webrtc';
import { StreamChatPanel } from './StreamChatPanel';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  presence?: RoomPresenceData | null;
  onSendMessage: (text: string) => void;
  onSendReaction?: (emoji: string) => void;
  currentPeerId: string;
  currentDisplayName?: string;
  onUpdateDisplayName?: (newName: string) => void;
  role?: UserRole;
  roomId?: string;
  onInviteToCoHost?: (peerId: string) => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  presence,
  onSendMessage,
  onSendReaction,
  currentPeerId,
  currentDisplayName = 'Пользователь',
  onUpdateDisplayName,
  role = 'viewer',
  roomId,
  onInviteToCoHost
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-88 md:w-96 p-2 sm:p-3 animate-in slide-in-from-right duration-200">
      <StreamChatPanel
        isOpen={isOpen}
        isDocked={false}
        onClose={onClose}
        messages={messages}
        presence={presence}
        onSendMessage={onSendMessage}
        onSendReaction={onSendReaction || (() => {})}
        currentPeerId={currentPeerId}
        currentDisplayName={currentDisplayName}
        onUpdateDisplayName={onUpdateDisplayName}
        role={role}
        roomId={roomId}
        onInviteToCoHost={onInviteToCoHost}
        className="h-full w-full shadow-2xl"
      />
    </div>
  );
};

