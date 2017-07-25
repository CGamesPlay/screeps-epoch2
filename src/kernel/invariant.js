// @flow

const invariant = (check: boolean, msg: string) => {
  if (!check) {
    throw new Error(msg);
  }
};

export default invariant;
