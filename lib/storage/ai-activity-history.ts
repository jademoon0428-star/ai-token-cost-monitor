import type { AIConsumer } from "@/lib/detection/ai-consumer";


export type AIActivityEvent = {

  id: string;

  timestamp: string;

  consumers: AIConsumer[];

  detectedCount: number;

};


const MAX_HISTORY = 100;


let history: AIActivityEvent[] = [];


export function addAIActivityEvent(
  consumers: AIConsumer[]
) {

  const event: AIActivityEvent = {

    id:
      `ai-${Date.now()}`,

    timestamp:
      new Date().toISOString(),

    consumers,

    detectedCount:
      consumers.length,

  };


  history.unshift(event);


  if(history.length > MAX_HISTORY){

    history =
      history.slice(0, MAX_HISTORY);

  }


  return event;

}



export function getAIActivityHistory(){

  return history;

}