"use client"

import { MessageSquare, X } from "lucide-react"
import * as React from "react"

import { useMediaQuery } from "@/hooks/use-media-query"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader
} from "@/components/ui/card"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useArtifactSelector } from '@/hooks/use-artifact'
import { useAutoResume } from '@/hooks/use-auto-resume'
import { useChatVisibility } from '@/hooks/use-chat-visibility'
import type { Vote } from '@/lib/db/schema'
import { ChatSDKError } from '@/lib/errors'
import { fetchWithErrorHandlers, fetcher, generateUUID } from '@/lib/utils'
import { useChat } from '@ai-sdk/react'
import type { Attachment, UIMessage } from 'ai'
import type { Session } from 'next-auth'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { unstable_serialize } from 'swr/infinite'
import { Artifact } from "../artifact"
import { ChatHeader } from "../chat-header"
import { Messages } from "../messages"
import { MultimodalInput } from "../multimodal-input"
import { getChatHistoryPaginationKey } from '../sidebar-history'
import { toast } from '../toast'
import type { VisibilityType } from '../visibility-selector'

interface Props {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
}

const FloatingChat = ({ id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume, }: Props) => {
  const [open, setOpen] = React.useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  const { mutate } = useSWRConfig();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
    experimental_resume,
    data,
  } = useChat({
    id,
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    fetch: fetchWithErrorHandlers,
    experimental_prepareRequestBody: (body) => ({
      id,
      message: body.messages.at(-1),
      selectedChatModel: initialChatModel,
      selectedVisibilityType: visibilityType,
    }),
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      append({
        role: 'user',
        content: query,
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, append, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  });

  const FloatingChatContent = () => (
    <Card className="w-full h-full border-0 md:border flex flex-col">
      <CardHeader className="flex-shrink-0">
        <ChatHeader
          chatId={id}
          selectedModelId={initialChatModel}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="w-full h-full pr-4">
          <Messages
            chatId={id}
            status={status}
            votes={votes}
            messages={messages}
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
            isArtifactVisible={isArtifactVisible}
          />
        </ScrollArea>
      </CardContent>
      <CardFooter className="flex-shrink-0">
        <form className="flex bg-background pb-4 sm:pb-6 gap-2 w-full sm:max-w-3xl">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              status={status}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              append={append}
              selectedVisibilityType={visibilityType}
            />
          )}
        </form>
      </CardFooter>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </Card>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg"
          >
            {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
            <span className="sr-only">Abrir chat</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          sideOffset={16}
          align="end"
          className="w-80 md:w-96 p-0"
        >
          <FloatingChatContent />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="fixed bottom-4 right-4 h-14 w-14 rounded-full shadow-lg"
          >
            {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
            <span className="sr-only">Abrir chat</span>
          </Button>
        </DrawerTrigger>
        <DrawerContent className="h-[90%]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Chat</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col h-full">
            <FloatingChatContent />
          </div>
          <DrawerFooter className="pt-2 sm:hidden">
            <DrawerClose asChild>
              <Button variant="outline">Fechar</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  )
}

export { FloatingChat }

