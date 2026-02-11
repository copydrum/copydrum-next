import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: unknown };

export class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // 화면 전체가 하얗게 되는 상황을 방지하기 위해 로그만 남긴다
    console.error('Route error:', error, info);
  }

  render() {
    if (this.state.error) {
      return <div>오류가 발생했습니다.</div>;
    }
    return this.props.children as React.ReactElement;
  }
}


